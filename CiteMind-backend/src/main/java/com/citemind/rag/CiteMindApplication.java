package com.citemind.rag;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
@MapperScan("com.citemind.rag.**.mapper")
public class CiteMindApplication {

    public static void main(String[] args) {
        SpringApplication.run(CiteMindApplication.class, args);
    }
}
